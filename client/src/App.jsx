import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Board from "./pages/Board";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/project/:id" element={<Board />} />
    </Routes>
  );
}

export default App;
