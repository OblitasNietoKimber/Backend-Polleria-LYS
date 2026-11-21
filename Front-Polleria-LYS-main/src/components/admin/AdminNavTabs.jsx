import { NavLink } from "react-router-dom";
import { BarChart3, UtensilsCrossed } from "lucide-react";

export default function AdminNavTabs() {
  return (
    <div className="admin-nav-tabs">
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `admin-nav-tab ${isActive ? "active" : ""}`}
      >
        <BarChart3 size={16} />
        <span>Dashboard</span>
      </NavLink>
      <NavLink
        to="/admin/productos"
        className={({ isActive }) => `admin-nav-tab ${isActive ? "active" : ""}`}
      >
        <UtensilsCrossed size={16} />
        <span>Gestión de Productos</span>
      </NavLink>
    </div>
  );
}
