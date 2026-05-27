import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";

import { Navbar } from "@/components/layout/Navbar";
import Home from "@/pages/Home";
import MatchPage from "@/pages/Match";
import PredictionsPage from "@/pages/Predictions";
import PlayerComparatorPage from "@/pages/PlayerComparator";
import ProfilePage from "@/pages/Profile";
import LoginPage from "@/pages/auth/Login";
import RegisterPage from "@/pages/auth/Register";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/players" element={<PlayerComparatorPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
