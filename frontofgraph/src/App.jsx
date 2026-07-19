import { BrowserRouter, Routes, Route } from "react-router-dom";

import CreatePath from "./components/CreatePath";
import WarehouseCreation from "./components/WarehouseCreation";
import WarehouseEditor from "./components/WarehouseEditor";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<CreatePath />} />
                <Route path="/warehouse/create" element={<WarehouseCreation />}/>
                <Route path="/warehouse/editor" element={<WarehouseEditor />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;