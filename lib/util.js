export const EVENT_TYPES = [
  { id: "meeting", label: "Meeting", color: "#B9C7D9" },
  { id: "fundraiser", label: "Fundraiser", color: "#F2C9C2" },
  { id: "rally", label: "Rally / Spirit", color: "#FFD8A8" },
  { id: "dance", label: "Dance", color: "#D9C9E8" },
  { id: "volunteer", label: "Volunteer", color: "#C9D1BC" },
  { id: "booth", label: "Booth", color: "#FFF3A8" },
  { id: "deadline", label: "Deadline", color: "#E8A89E" },
  { id: "other", label: "Other", color: "#E8DCC4" },
];

export const typeById = (id) =>
  EVENT_TYPES.find((t) => t.id === id) || EVENT_TYPES[EVENT_TYPES.length - 1];

export const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function parseDate(str) {
  const [y, m, d] = String(str).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function ymd(dt) {
  return (
    dt.getFullYear() + "-" +
    String(dt.getMonth() + 1).padStart(2, "0") + "-" +
    String(dt.getDate()).padStart(2, "0")
  );
}
export function todayYMD() {
  return ymd(new Date());
}
export function formatTime(t) {
  if (!t) return "";
  const [h, mn] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return hh + ":" + String(mn).padStart(2, "0") + " " + ap;
}
export function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}
export function suggestPassword() {
  const words = ["spirit","panther","rally","gold","purple","crew","pep","banner","royal","home"];
  const w = words[Math.floor(Math.random() * words.length)];
  return w + "-" + Math.floor(1000 + Math.random() * 9000);
}

// Resize an uploaded image on the client, return a small Blob + preview URL.
export function resizeImage(file, max = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > h && w > max) { h = Math.round((h * max) / w); w = max; }
        else if (h >= w && h > max) { w = Math.round((w * max) / h); h = max; }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob(
          (blob) => {
            if (!blob) { reject(new Error("Could not process image")); return; }
            const ext = blob.type.includes("webp") ? "webp" : "jpg";
            resolve({ blob, url: URL.createObjectURL(blob), ext });
          },
          "image/webp",
          0.82
        );
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
