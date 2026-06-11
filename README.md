# PyroTankX 🚀

PyroTankX is a fast-paced, wave-based 2D tank shooter built with **HTML5 Canvas, CSS3, and JavaScript**, powered by the **Vite** build engine.

Take control of your tank, destroy enemy armor rolling in from all sides, collect power-ups, and survive as long as you can. Simple to play, hard to master.

---

## 🎮 Live Demo & Deployment
This project is configured to deploy instantly on **Vercel**!
To publish:
1. Push this repository to your GitHub account.
2. Link it in the **Vercel Dashboard**.
3. Deploy! (Vercel automatically detects the Vite configuration).

---

## 🕹️ Controls
- **Move & Rotate Tank Body:** `W`, `A`, `S`, `D` or `Arrow Keys`
- **Aim Turret & Shoot:** Move your Mouse to aim and **Left-Click** (or press `Spacebar`) to fire.

---

## ✨ Features
- **Smooth 60FPS Gameplay:** Driven by HTML5 Canvas and `requestAnimationFrame`.
- **Wave System:** Increasingly difficult waves spawning additional enemies with varying attributes.
- **Visual Power-ups:**
  - 🟢 **Armor Boost (Green Cross):** Recovers your tank's armor.
  - 🟡 **Rapid Fire (Lightning Bolt):** Dramatically speeds up your firing rate.
  - 🔵 **Visual Energy Shield (Cyan Circle):** Grants temporary invulnerability with a pulsing visual shield effect.
- **Glassmorphic UI Overlay:** Responsive start and game over menus featuring glowing text shadows and modern micro-animations.
- **Persistent High Score:** Uses browser `localStorage` to save and display your high scores.

---

## 🛠️ Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- [npm](https://www.npmjs.com/)

### Installation & Run
1. Clone the repository:
   ```bash
   git clone https://github.com/bvrao204/PyroTankX.git
   cd PyroTankX
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run local Vite dev server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

4. Create production build:
   ```bash
   npm run build
   ```
