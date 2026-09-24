import { BrowserRouter, Routes, Route } from "react-router-dom"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import Parcelles from "./pages/Parcelles"
import Estimation from "./pages/Estimation"
import Utilisateurs from './pages/Utilisateurs'
import Transactions from "./pages/Transactions"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/parcelles" element={<Parcelles />} />
        <Route path="/estimation" element={<Estimation />} />
        <Route path="/utilisateurs" element={<Utilisateurs />} />
        <Route path="/transactions" element={<Transactions />} />
      </Routes>
    </BrowserRouter>
  )
}


