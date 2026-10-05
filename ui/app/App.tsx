import { PageLayout } from "@dynatrace/strato-components/layouts";
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppFooter } from "./components/AppFooter";
import { Header } from "./components/Header";
import { DiagramEditorPage } from "./pages/DiagramEditorPage";
import { DiagramListPage } from "./pages/DiagramListPage";

export const App = () => {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Header />
      </PageLayout.Header>
      <PageLayout.Content>
        {/*
          The page never scrolls: each view scrolls inside itself. position: relative makes this box the containing
          block of absolutely positioned helpers (hidden form inputs, editor measurers), so overflow: clip contains them
          too instead of letting them stretch and scroll the page.
        */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "clip", position: "relative" }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Routes>
              <Route path="/" element={<DiagramListPage />} />
              <Route path="/diagram/:id" element={<DiagramEditorPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <AppFooter />
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
};
