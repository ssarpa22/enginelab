import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AudioLab from "./AudioLab";
import "./styles.css";

const root = window.location.pathname === "/audio-lab" ? <AudioLab /> : <App />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{root}</React.StrictMode>
);
