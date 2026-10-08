# LED Strip Lamp Designer • Multi-Material 3MF Studio

A 100% browser-based parametric CAD studio for customizing and 3D printing organic, multi-material LED lamps with internal addressable LED strips and base-integrated microcontrollers.

Built using **Vite + TypeScript + Three.js + Manifold-3D WASM (in Web Worker) + fflate**.

---

## ⚡ Hardware Compatibility

* **LED Strip**: WS2812B DC 5V, 60 LEDs/m, IP30 White PCB ($10\text{ mm}$ width).
  * Automatically calculates segment lengths, cut markers ($16.67\text{ mm}$ pitch), and power draw.
  * Typical draw: $\sim 0.8\text{--}1.2\text{A}$ at 5V ($4\text{--}6\text{W}$) running directly off USB power.
* **Controller**: ESP32-C6 SuperMini Development Board (USB-C).
  * Snap-fit horizontal retention cradle in the base.
  * Precision flush USB-C pass-through cutout on the outer rim.
  * Direct 3.3V GPIO driving with hardware RMT peripheral (compatible with **WLED** and FastLED).

---

## 🛠️ Key Mechanical & Assemblability Features

1. **Hollow-Core Monolithic Architecture**:
   * Co-printed as a single multi-material part (Opaque dark shell + Translucent white veins).
   * Wide central bore ($\ge 50\text{--}65\text{ mm}$ ID) allows hand and finger access from the bottom.
2. **Open-Backed Rear Strip Channels**:
   * Continuous $10.6\text{ mm} \times 2.0\text{ mm}$ tracks with compliant retention lips face inward into the hollow core directly behind each diffuser vein.
   * Strip segments click directly into place from the inside.
3. **Bench-Friendly Wiring Harness**:
   * Strips are pre-soldered and tested on the workbench before insertion.
   * All power distribution and daisy-chain loops meet at the bottom collar manifold.
4. **Twist-Lock Electronics Base Cradle**:
   * Bayonet lugs lock the base cradle securely to the lamp body.
   * Removable for easy servicing, microcontroller flashing, or cable adjustments.

---

## 🚀 Cloudflare Pages Deployment

Deploy directly from GitHub to Cloudflare Pages:

1. Push this repository to GitHub.
2. In the **Cloudflare Dashboard**, navigate to **Compute (Workers) & Pages** $\to$ **Create application** $\to$ **Pages** $\to$ **Connect to Git**.
3. Select this repository: `thermo-lab/led-strip-lamp`.
4. Configure Build Settings:
   * **Framework preset**: `Vite`
   * **Build command**: `npm run build`
   * **Build output directory**: `dist`
   * **Node.js version**: `20` (detected automatically via `.node-version`)
5. Click **Save and Deploy**.

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build production bundle
npm run build
```

---

## 📦 3D Print Export

* **Multi-Material 3MF**: Exports a single `.3mf` project file containing:
  * **Opaque Shell**: Toolhead 1 / Dark PLA
  * **Translucent Veins**: Toolhead 2 or 3 / White PLA
  * **Base Cradle**: Toolhead 1 / Dark PLA
  * Pre-configured for direct import into **Snapmaker Orca**, **Bambu Studio**, and **PrusaSlicer**.
* **Individual STLs**: Standalone binary STL export for each component.
