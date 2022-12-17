import React from "react";
import ReactDOM from "react-dom/client";
import MainPage from ".";
import "./styles/index.css";
import { grey } from "@mui/material/colors";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { Toaster } from "react-hot-toast";

const theme = createTheme({
  palette: {
    primary: {
      main: grey[900],
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <MainPage />
      <Toaster position="bottom-center" />
    </ThemeProvider>
  </React.StrictMode>
);
