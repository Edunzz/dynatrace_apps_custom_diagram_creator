import { PageLayout } from "@dynatrace/strato-components/layouts";
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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
        <Routes>
          <Route path="/" element={<DiagramListPage />} />
          <Route path="/diagram/:id" element={<DiagramEditorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageLayout.Content>
    </PageLayout>
  );
};
