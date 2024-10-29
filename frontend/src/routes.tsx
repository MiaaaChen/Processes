import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Activity from "./pages/Activity";
import Profile from "./pages/Profile";

const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <Home />, handle: { title: "首頁" } },
      {
        path: "/search",
        element: <Search />,
        handle: { title: "搜尋" },
      },
      {
        path: "/activity",
        element: <Activity />,
        handle: { title: "動態" },
      },
      {
        path: "/profile",
        element: <Profile />,
        handle: { title: "個人檔案" },
      },
    ],
  },
]);

const AppRoutes: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default AppRoutes;
