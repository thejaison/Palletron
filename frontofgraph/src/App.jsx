import { BrowserRouter, Routes, Route } from "react-router-dom";

import LandingPage from "./components/LandingPage";
import WarehouseCreation from "./components/WarehouseCreation";
import WarehouseEditor from "./components/WarehouseEditor";
import WarehouseSimulation from "./components/WarehouseSimulation";
import SchematicSimulation from "./components/SchematicSimulation";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/configure" element={<WarehouseCreation />}/>
                <Route path="/editor" element={<WarehouseEditor />} />
                <Route path="/simulation" element={<WarehouseSimulation />} />
                <Route path="/simulation/schematic" element={<WarehouseSimulation defaultTab="schematic" />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;