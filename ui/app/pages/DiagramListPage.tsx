import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { Modal, Tooltip } from "@dynatrace/strato-components/overlays";
import { TextInput } from "@dynatrace/strato-components/forms";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { showToast } from "@dynatrace/strato-components/notifications";
import { DeleteIcon, DownloadIcon, DuplicateIcon, FolderOpenIcon, PlusIcon, SettingIcon, UploadIcon } from "@dynatrace/strato-icons";
import { parseDiagram, type Diagram } from "../model/schema";
import { buildSampleDiagram } from "../model/defaults";
import { asText, dqlString, errorMessage, runQuery } from "../services/dql";
import { downloadJson, slugify } from "../services/download";
import {
  LOOKUP_PATH,
  currentUser,
  deleteDiagrams,
  deleteLookupFile,
  ensureStore,
  getDiagram,
  listDiagrams,
  newId,
  saveDiagram,
  type DiagramSummary,
} from "../services/lookupStore";
import { listSlos } from "../services/slo";
import { formatDateTime } from "../services/time";
import { InlineMessage } from "../panels/Field";

const ADMIN_PREFIX = "/lookups/custom-diagram-creator/";

interface FileRow {
  name: string;
  displayName: string;
  size: number;
  records: number;
  modified: string;
}

function AdminModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await runQuery(
        `fetch dt.system.files\n| filter startsWith(name, ${dqlString(ADMIN_PREFIX)})\n| fields name, display_name, size, records, modified.timestamp`,
      );
      setFiles(
        r.records.map((x) => ({
          name: asText(x.name),
          displayName: asText(x.display_name),
          size: Number(x.size ?? 0),
          records: Number(x.records ?? 0),
          modified: asText(x["modified.timestamp"]),
        })),
      );
    } catch (e) {
      setError(errorMessage(e));
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    if (show) {
      void load();
    }
  }, [show, load]);

  return (
    <Modal title="Administración del almacenamiento" show={show} onDismiss={onClose} size="large">
      <Flex flexDirection="column" gap={12}>
        <InlineMessage kind="info">
          Archivos de lookup de la app ({ADMIN_PREFIX}). Eliminar un archivo es irreversible; si eliminas {LOOKUP_PATH} se volverá
          a crear con el diagrama de ejemplo al abrir la app.
        </InlineMessage>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        <table className="cdc-kpi-table">
          <thead>
            <tr>
              <th>Ruta</th>
              <th>Nombre</th>
              <th>Registros</th>
              <th>Tamaño</th>
              <th>Modificado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(files ?? []).map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{f.displayName}</td>
                <td className="cdc-num">{f.records}</td>
                <td className="cdc-num">{(f.size / 1024).toFixed(1)} KB</td>
                <td>{formatDateTime(f.modified)}</td>
                <td>
                  {confirm === f.name ? (
                    <Flex gap={4}>
                      <Button
                        size="condensed"
                        color="critical"
                        variant="emphasized"
                        onClick={() => {
                          deleteLookupFile(f.name)
                            .then(() => {
                              showToast({ type: "success", title: `Eliminado ${f.name}`, lifespan: 3000 });
                              setConfirm(null);
                              return load();
                            })
                            .catch((e) => showToast({ type: "critical", title: "No se pudo eliminar", message: errorMessage(e) }));
                        }}
                      >
                        Confirmar
                      </Button>
                      <Button size="condensed" onClick={() => setConfirm(null)}>
                        Cancelar
                      </Button>
                    </Flex>
                  ) : (
                    <Button size="condensed" color="critical" onClick={() => setConfirm(f.name)}>
                      Eliminar archivo
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {files !== null && files.length === 0 && (
              <tr>
                <td colSpan={6}>No hay archivos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Flex>
    </Modal>
  );
}

export function DiagramListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DiagramSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await listDiagrams());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setRows([]);
    }
  }, []);

  // Bootstrap: if the lookup doesn't exist, create it with the sample diagram.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await ensureStore(async () => {
          const slos = await listSlos().catch(() => []);
          return buildSampleDiagram("system", slos.slice(0, 3));
        });
        if (result === "created") {
          showToast({
            type: "success",
            title: "Se creó el almacenamiento de diagramas",
            message: "Se añadió el diagrama de ejemplo «Sample – Online Banking».",
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      }
      if (!cancelled) {
        await reload();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const selectedIds = Object.keys(selection).filter((k) => selection[k]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
  }, [rows, search]);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast({ type: "critical", title: "Error", message: errorMessage(e), lifespan: "infinite" });
    } finally {
      setBusy(false);
    }
  };

  const duplicate = (id: string) =>
    withBusy(async () => {
      const { diagram } = await getDiagram(id);
      const now = new Date().toISOString();
      const copy: Diagram = { ...diagram, id: newId(), name: `${diagram.name} (copia)`, owner: currentUser(), createdAt: now, updatedAt: now };
      await saveDiagram(copy);
      showToast({ type: "success", title: `Duplicado como «${copy.name}»`, lifespan: 3000 });
      await reload();
    });

  const download = (ids: string[]) =>
    withBusy(async () => {
      for (const id of ids) {
        const { diagram } = await getDiagram(id);
        downloadJson(`${slugify(diagram.name)}.json`, diagram);
      }
    });

  const remove = (ids: string[]) =>
    withBusy(async () => {
      await deleteDiagrams(ids);
      setSelection({});
      setConfirmDelete(null);
      showToast({ type: "success", title: `${ids.length} diagrama(s) eliminado(s)`, lifespan: 3000 });
      await reload();
    });

  const upload = (files: FileList | null) =>
    withBusy(async () => {
      if (!files?.length) {
        return;
      }
      const existing = new Set((rows ?? []).map((r) => r.id));
      let ok = 0;
      for (const file of Array.from(files)) {
        let json: unknown;
        try {
          json = JSON.parse(await file.text());
        } catch {
          showToast({ type: "critical", title: `${file.name}: no es un JSON válido` });
          continue;
        }
        const parsed = parseDiagram(json);
        if (!parsed.ok) {
          showToast({ type: "critical", title: `${file.name}: no cumple el esquema`, message: parsed.error, lifespan: "infinite" });
          continue;
        }
        let diagram = parsed.diagram;
        if (existing.has(diagram.id)) {
          const now = new Date().toISOString();
          diagram = { ...diagram, id: newId(), createdAt: now, updatedAt: now };
        }
        diagram = { ...diagram, owner: diagram.owner || currentUser() };
        await saveDiagram(diagram);
        existing.add(diagram.id);
        ok++;
      }
      if (ok) {
        showToast({ type: "success", title: `${ok} diagrama(s) subido(s)`, lifespan: 3000 });
      }
      await reload();
    });

  const columns: DataTableColumnDef<DiagramSummary>[] = [
    {
      id: "name",
      header: "Nombre",
      accessor: "name",
      width: "2fr",
      cell: ({ value, rowData }) => (
        <Button variant="default" size="condensed" onClick={() => navigate(`/diagram/${rowData.id}`)}>
          {asText(value)}
        </Button>
      ),
    },
    { id: "description", header: "Descripción", accessor: "description", width: "2fr" },
    { id: "owner", header: "Propietario", accessor: "owner", width: "1fr" },
    {
      id: "createdAt",
      header: "Creado",
      accessor: "createdAt",
      width: "1fr",
      cell: ({ value }) => <span>{formatDateTime(value as string)}</span>,
    },
    {
      id: "updatedAt",
      header: "Modificado",
      accessor: "updatedAt",
      width: "1fr",
      cell: ({ value }) => <span>{formatDateTime(value as string)}</span>,
    },
    {
      id: "actions",
      header: "Acciones",
      accessor: "id",
      width: "content",
      cell: ({ rowData }) => (
        <Flex gap={2}>
          <Tooltip text="Abrir">
            <Button aria-label="Abrir" size="condensed" onClick={() => navigate(`/diagram/${rowData.id}`)}>
              <Button.Prefix>
                <FolderOpenIcon />
              </Button.Prefix>
            </Button>
          </Tooltip>
          <Tooltip text="Duplicar">
            <Button aria-label="Duplicar" size="condensed" disabled={busy} onClick={() => void duplicate(rowData.id)}>
              <Button.Prefix>
                <DuplicateIcon />
              </Button.Prefix>
            </Button>
          </Tooltip>
          <Tooltip text="Descargar JSON">
            <Button aria-label="Descargar JSON" size="condensed" disabled={busy} onClick={() => void download([rowData.id])}>
              <Button.Prefix>
                <DownloadIcon />
              </Button.Prefix>
            </Button>
          </Tooltip>
          <Tooltip text="Eliminar">
            <Button aria-label="Eliminar" size="condensed" color="critical" disabled={busy} onClick={() => setConfirmDelete([rowData.id])}>
              <Button.Prefix>
                <DeleteIcon />
              </Button.Prefix>
            </Button>
          </Tooltip>
        </Flex>
      ),
    },
  ];

  return (
    <Flex flexDirection="column" gap={16} padding={24} style={{ height: "100%", boxSizing: "border-box", overflow: "auto" }}>
      <Flex alignItems="center" gap={12} flexWrap="wrap">
        <Flex flexDirection="column" gap={2} style={{ flex: 1, minWidth: 260 }}>
          <Heading level={2}>Diagramas</Heading>
          <span style={{ color: Colors.Text.Neutral.Subdued, fontSize: 13 }}>
            Arquitecturas personalizadas con estado en vivo (problems, SLOs y KPIs desde Grail).
          </span>
        </Flex>
        <Button variant="accent" color="primary" onClick={() => navigate("/diagram/new")}>
          <Button.Prefix>
            <PlusIcon />
          </Button.Prefix>
          Nuevo diagrama
        </Button>
        <Button onClick={() => fileInput.current?.click()} disabled={busy}>
          <Button.Prefix>
            <UploadIcon />
          </Button.Prefix>
          Subir
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <Tooltip text="Administración del almacenamiento">
          <Button aria-label="Administración" onClick={() => setAdminOpen(true)}>
            <Button.Prefix>
              <SettingIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      </Flex>

      <Flex alignItems="center" gap={12} flexWrap="wrap">
        <div style={{ width: 320 }}>
          <TextInput value={search} onChange={(v) => setSearch(v)} placeholder="Buscar por nombre…" aria-label="Buscar" />
        </div>
        {selectedIds.length > 0 && (
          <>
            <span style={{ fontSize: 13 }}>{selectedIds.length} seleccionado(s)</span>
            <Button size="condensed" disabled={busy} onClick={() => void download(selectedIds)}>
              <Button.Prefix>
                <DownloadIcon />
              </Button.Prefix>
              Descargar
            </Button>
            <Button size="condensed" color="critical" disabled={busy} onClick={() => setConfirmDelete(selectedIds)}>
              <Button.Prefix>
                <DeleteIcon />
              </Button.Prefix>
              Eliminar
            </Button>
          </>
        )}
      </Flex>

      {error && <InlineMessage kind="error">{error}</InlineMessage>}

      <DataTable
        data={filtered}
        columns={columns}
        rowId={(row) => row.id}
        sortable
        defaultSortBy={[{ id: "updatedAt", desc: true }]}
        selectableRows
        onRowSelectionChange={setSelection}
        loading={rows === null}
        fullWidth
      >
        <DataTable.EmptyState>
          {search ? "Ningún diagrama coincide con la búsqueda." : "Todavía no hay diagramas. Crea uno nuevo o sube un JSON."}
        </DataTable.EmptyState>
      </DataTable>

      <Modal
        title="Eliminar diagramas"
        show={confirmDelete !== null}
        onDismiss={() => setConfirmDelete(null)}
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button color="critical" variant="emphasized" loading={busy} onClick={() => confirmDelete && void remove(confirmDelete)}>
              Eliminar
            </Button>
          </Flex>
        }
      >
        {confirmDelete && (
          <span>
            ¿Eliminar {confirmDelete.length === 1 ? "este diagrama" : `${confirmDelete.length} diagramas`}? Esta acción no se puede
            deshacer.
          </span>
        )}
      </Modal>

      <AdminModal show={adminOpen} onClose={() => setAdminOpen(false)} />
    </Flex>
  );
}
