import "./globals.css";

export const metadata = {
  title: "ASB · Class of 2027",
  description: "Jurupa Hills High School — ASB Class of 2027 HQ: events, shifts, and the crew.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4f1",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
