import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    server: {
        fs: {
            // Allow importing ABI JSON straight from the sibling /contracts
            // Hardhat project (../contracts, relative to /frontend), so ABIs are
            // never hand-typed -- see src/config/contracts.ts.
            allow: [".."],
        },
    },
});
