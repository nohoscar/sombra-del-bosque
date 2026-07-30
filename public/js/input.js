// Manejo de teclado. Guarda el estado de las teclas y "pulsaciones" de un frame.
const Input = {
  keys: {},          // estado continuo (mantener presionado)
  pressed: {},       // solo el frame en que se presionó
  _pressedBuffer: {},
  moveX: 0,          // eje analógico del joystick táctil (-1..1)
  moveY: 0,

  init() {
    window.addEventListener("keydown", (e) => {
      const k = this._normalize(e);
      if (k) {
        if (!this.keys[k]) this._pressedBuffer[k] = true;
        this.keys[k] = true;
        // Evita el scroll de la página con flechas/espacio
        if (["up", "down", "left", "right", "jump"].includes(k)) e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      const k = this._normalize(e);
      if (k) this.keys[k] = false;
    });

    // Si la ventana pierde foco, soltamos todo (evita quedarse "corriendo")
    window.addEventListener("blur", () => {
      this.keys = {};
    });
  },

  // Traduce códigos de tecla a acciones del juego
  _normalize(e) {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA": return "left";
      case "ArrowRight":
      case "KeyD": return "right";
      case "ArrowUp":
      case "KeyW": return "up";
      case "ArrowDown":
      case "KeyS": return "down";
      case "Space": return "jump";
      case "ShiftLeft":
      case "ShiftRight": return "run";
      case "ControlLeft":
      case "ControlRight": return "crouch";
      case "KeyE": return "interact";
      case "KeyQ": return "throw";
      case "KeyF": return "flashlight";
      default: return null;
    }
  },

  // Copia el buffer de pulsaciones al inicio de cada frame
  update() {
    this.pressed = { ...this._pressedBuffer };
    this._pressedBuffer = {};
  },

  isDown(action) {
    return !!this.keys[action];
  },

  wasPressed(action) {
    return !!this.pressed[action];
  },

  // --- Entrada virtual (controles táctiles) ---
  press(action) {
    if (!this.keys[action]) this._pressedBuffer[action] = true;
    this.keys[action] = true;
  },
  release(action) {
    this.keys[action] = false;
  },
  setAxis(x, y) {
    this.moveX = x;
    this.moveY = y;
  },
};
