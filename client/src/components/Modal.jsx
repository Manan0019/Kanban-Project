import React from "react";

function Modal({ children, onClose }) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {children}
        <button onClick={onClose} style={closeBtn}>
          ✕
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100vw",
  height: "100vh",
  backgroundColor: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalStyle = {
  background: "white",
  padding: 30,
  borderRadius: 10,
  minWidth: 400,
  position: "relative",
};

const closeBtn = {
  position: "absolute",
  top: 10,
  right: 10,
  border: "none",
  background: "transparent",
  fontSize: 18,
  cursor: "pointer",
};

export default Modal;
