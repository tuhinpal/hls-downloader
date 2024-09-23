import React from "react";
import ReactDOM from "react-dom/client";
import MainPage from ".";
import "./styles/index.css";
import { grey } from "@mui/material/colors";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { Toaster } from "react-hot-toast";
import { BrowserRouter as Router } from 'react-router-dom'; // Import BrowserRouter

const theme = createTheme({
  palette: {
    primary: {
      main: grey[900],
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <Router>  {/* Add Router here */}
        <MainPage />
      </Router>
      <Toaster position="bottom-center" />
    </ThemeProvider>
  </React.StrictMode>
);
