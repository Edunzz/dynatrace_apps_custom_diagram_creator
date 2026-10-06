import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Button } from "@dynatrace/strato-components/buttons";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Link } from "@dynatrace/strato-components/typography";
import { Modal, Tooltip } from "@dynatrace/strato-components/overlays";
import { TextInput } from "@dynatrace/strato-components/forms";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { showToast } from "@dynatrace/strato-components/notifications";
import {
  DeleteIcon,
  DownloadIcon,
  DuplicateIcon,
  FolderOpenIcon,
  InformationIcon,
  PlusIcon,
  SettingIcon,
  UploadIcon,
} from "@dynatrace/strato-icons";
import { parseDiagram, type Diagram } from "../model/schema";
import { asText, dqlString, errorMessage, runQuery } from "../services/dql";
import { downloadJson, slugify } from "../services/download";
import {
  LOOKUP_PATH,
  currentUser,
  deleteDiagrams,
  deleteLookupFile,
  ensureSamples,
  getDiagram,
  listDiagrams,
  newId,
  saveDiagram,
  saveDiagrams,
  type DiagramSummary,
} from "../services/lookupStore";
import { sampleCatalog } from "../samples";
import { listSlos } from "../services/slo";
import { formatDateTime } from "../services/time";
import { InlineMessage } from "../panels/Field";
import { AboutModal } from "../components/AboutModal";

/** Single-line text that ends with … when the column is too narrow. */
const ELLIPSIS = { display: "block", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

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
    <Modal title="Storage administration" show={show} onDismiss={onClose} size="large">
      <Flex flexDirection="column" gap={12}>
        <InlineMessage kind="info">
          Lookup files of the app ({ADMIN_PREFIX}). Deleting a file can't be undone; if you delete {LOOKUP_PATH} it is
          created again with the sample diagram the next time the app opens.
        </InlineMessage>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        <table className="cdc-kpi-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Name</th>
              <th>Records</th>
              <th>Size</th>
              <th>Modified</th>
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
                              showToast({ type: "success", title: `Deleted ${f.name}`, lifespan: 3000 });
                              setConfirm(null);
                              return load();
                            })
                            .catch((e) => showToast({ type: "critical", title: "Couldn't delete", message: errorMessage(e) }));
                        }}
                      >
                        Confirm
                      </Button>
                      <Button size="condensed" onClick={() => setConfirm(null)}>
                        Cancel
                      </Button>
                    </Flex>
                  ) : (
                    <Button size="condensed" color="critical" onClick={() => setConfirm(f.name)}>
                      Delete file
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {files !== null && files.length === 0 && (
              <tr>
                <td colSpan={6}>No files.</td>
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
  const [aboutOpen, setAboutOpen] = useState(false);
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

  // Bootstrap: creates the lookup with the sample diagrams, and adds samples this table has never received.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { created, added } = await ensureSamples(sampleCatalog(listSlos));
        if (created) {
          showToast({
            type: "success",
            title: "Diagram storage created",
            message: `Sample diagrams added: ${added.join(", ")}.`,
          });
        } else if (added.length) {
          showToast({ type: "info", title: "New sample diagrams", message: added.join(", "), lifespan: 6000 });
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
      const copy: Diagram = { ...diagram, id: newId(), name: `${diagram.name} (copy)`, owner: currentUser(), createdAt: now, updatedAt: now };
      await saveDiagram(copy);
      showToast({ type: "success", title: `Duplicated as "${copy.name}"`, lifespan: 3000 });
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
      showToast({ type: "success", title: `${ids.length} diagram(s) deleted`, lifespan: 3000 });
      await reload();
    });

  const upload = (files: FileList | null) =>
    withBusy(async () => {
      if (!files?.length) {
        return;
      }
      const existing = new Set((rows ?? []).map((r) => r.id));
      const valid: Diagram[] = [];
      for (const file of Array.from(files)) {
        let json: unknown;
        try {
          json = JSON.parse(await file.text());
        } catch {
          showToast({ type: "critical", title: `${file.name}: not valid JSON` });
          continue;
        }
        const parsed = parseDiagram(json);
        if (!parsed.ok) {
          showToast({ type: "critical", title: `${file.name}: doesn't match the schema`, message: parsed.error, lifespan: "infinite" });
          continue;
        }
        let diagram = parsed.diagram;
        if (existing.has(diagram.id)) {
          const now = new Date().toISOString();
          diagram = { ...diagram, id: newId(), createdAt: now, updatedAt: now };
        }
        diagram = { ...diagram, owner: diagram.owner || currentUser() };
        existing.add(diagram.id);
        valid.push(diagram);
      }
      if (valid.length === 0) {
        return;
      }
      // One write for every file; it returns once the lookup serves the new rows, so the reload shows them.
      setRows(null);
      try {
        await saveDiagrams(valid);
      } finally {
        await reload();
      }
      showToast({ type: "success", title: `${valid.length} diagram(s) uploaded`, lifespan: 3000 });
    });

  /**
   * Plain text cell that opens the diagram on click, so the whole row (except checkbox and actions) is a target.
   * Custom cells go inside DataTable.DefaultCell to keep the table's padding and vertical alignment.
   */
  const openCell = (id: string, text: string) => (
    <DataTable.DefaultCell onClick={() => navigate(`/diagram/${id}`)} style={{ cursor: "pointer" }} title={text}>
      <span style={ELLIPSIS}>{text}</span>
    </DataTable.DefaultCell>
  );

  const columns: DataTableColumnDef<DiagramSummary>[] = [
    {
      id: "name",
      header: "Name",
      accessor: "name",
      width: "2fr",
      cell: ({ value, rowData }) => (
        <DataTable.DefaultCell>
          <Link as={RouterLink} to={`/diagram/${rowData.id}`} style={ELLIPSIS}>
            {asText(value)}
          </Link>
        </DataTable.DefaultCell>
      ),
    },
    { id: "description", header: "Description", accessor: "description", width: "2fr", cell: ({ value, rowData }) => openCell(rowData.id, asText(value)) },
    { id: "owner", header: "Owner", accessor: "owner", width: "1fr", cell: ({ value, rowData }) => openCell(rowData.id, asText(value)) },
    {
      id: "createdAt",
      header: "Created",
      accessor: "createdAt",
      width: "1fr",
      cell: ({ value, rowData }) => openCell(rowData.id, formatDateTime(value as string)),
    },
    {
      id: "updatedAt",
      header: "Modified",
      accessor: "updatedAt",
      width: "1fr",
      cell: ({ value, rowData }) => openCell(rowData.id, formatDateTime(value as string)),
    },
    {
      id: "actions",
      header: "Actions",
      accessor: "id",
      width: "content",
      cell: ({ rowData }) => (
        <DataTable.DefaultCell>
          <Flex gap={2}>
            <Tooltip text="Open">
              <Button aria-label="Open" size="condensed" onClick={() => navigate(`/diagram/${rowData.id}`)}>
                <Button.Prefix>
                  <FolderOpenIcon />
                </Button.Prefix>
              </Button>
            </Tooltip>
            <Tooltip text="Duplicate">
              <Button aria-label="Duplicate" size="condensed" disabled={busy} onClick={() => void duplicate(rowData.id)}>
                <Button.Prefix>
                  <DuplicateIcon />
                </Button.Prefix>
              </Button>
            </Tooltip>
            <Tooltip text="Download JSON">
              <Button aria-label="Download JSON" size="condensed" disabled={busy} onClick={() => void download([rowData.id])}>
                <Button.Prefix>
                  <DownloadIcon />
                </Button.Prefix>
              </Button>
            </Tooltip>
            <Tooltip text="Delete">
              <Button aria-label="Delete" size="condensed" color="critical" disabled={busy} onClick={() => setConfirmDelete([rowData.id])}>
                <Button.Prefix>
                  <DeleteIcon />
                </Button.Prefix>
              </Button>
            </Tooltip>
          </Flex>
        </DataTable.DefaultCell>
      ),
    },
  ];

  return (
    <Flex flexDirection="column" gap={16} padding={24} style={{ height: "100%", boxSizing: "border-box", overflow: "auto" }}>
      <Flex alignItems="center" gap={12} flexWrap="wrap">
        <Flex flexDirection="column" gap={2} style={{ flex: 1, minWidth: 260 }}>
          <Heading level={2}>Diagrams</Heading>
          <span style={{ color: Colors.Text.Neutral.Subdued, fontSize: 13 }}>
            Custom architecture diagrams with live status (problems, SLOs and KPIs from Grail).
          </span>
        </Flex>
        <Button variant="accent" color="primary" onClick={() => navigate("/diagram/new")}>
          <Button.Prefix>
            <PlusIcon />
          </Button.Prefix>
          New diagram
        </Button>
        <Button onClick={() => fileInput.current?.click()} disabled={busy}>
          <Button.Prefix>
            <UploadIcon />
          </Button.Prefix>
          Upload
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
        <Tooltip text="About">
          <Button aria-label="About" onClick={() => setAboutOpen(true)}>
            <Button.Prefix>
              <InformationIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
        <Tooltip text="Storage administration">
          <Button aria-label="Storage administration" onClick={() => setAdminOpen(true)}>
            <Button.Prefix>
              <SettingIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      </Flex>

      <Flex alignItems="center" gap={12} flexWrap="wrap">
        <div style={{ width: 320 }}>
          <TextInput value={search} onChange={(v) => setSearch(v)} placeholder="Search by name…" aria-label="Search" />
        </div>
        {selectedIds.length > 0 && (
          <>
            <span style={{ fontSize: 13 }}>{selectedIds.length} selected</span>
            <Button size="condensed" disabled={busy} onClick={() => void download(selectedIds)}>
              <Button.Prefix>
                <DownloadIcon />
              </Button.Prefix>
              Download
            </Button>
            <Button size="condensed" color="critical" disabled={busy} onClick={() => setConfirmDelete(selectedIds)}>
              <Button.Prefix>
                <DeleteIcon />
              </Button.Prefix>
              Delete
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
          {search ? "No diagram matches your search." : "No diagrams yet. Create one or upload a JSON file."}
        </DataTable.EmptyState>
      </DataTable>

      <Modal
        title="Delete diagrams"
        show={confirmDelete !== null}
        onDismiss={() => setConfirmDelete(null)}
        footer={
          <Flex gap={8} justifyContent="flex-end">
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button color="critical" variant="emphasized" loading={busy} onClick={() => confirmDelete && void remove(confirmDelete)}>
              Delete
            </Button>
          </Flex>
        }
      >
        {confirmDelete && (
          <span>
            Delete {confirmDelete.length === 1 ? "this diagram" : `${confirmDelete.length} diagrams`}? This can't be undone.
          </span>
        )}
      </Modal>

      <AdminModal show={adminOpen} onClose={() => setAdminOpen(false)} />
      <AboutModal show={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Flex>
  );
}
