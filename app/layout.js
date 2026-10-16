import { Gloock, Courier_Prime, Caveat } from "next/font/google";
import "./globals.css";

const display = Gloock({ weight: "400", subsets: ["latin"], variable: "--f-display", display: "swap" });
const body = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"], variable: "--f-body", display: "swap" });
const hand = Caveat({ weight: ["600", "700"], subsets: ["latin"], variable: "--f-hand", display: "swap" });

export const metadata = {
  title: "ASB · Class of 2027",
  description: "Jurupa Hills High School — ASB Class of 2027 HQ: events, shifts, and the crew.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#d8c3a1",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
