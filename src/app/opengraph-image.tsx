import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "Churn — an unofficial browser visualizer powered by Butterchurn";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        color: "#f7f5ef",
        background: "#08080a",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-180px -80px -140px 340px",
          display: "flex",
          borderRadius: "50%",
          background:
            "repeating-radial-gradient(ellipse at 52% 48%, #eaf6f1 0 10px, #87a9a4 13px 25px, #273d3b 29px 47px, #101516 52px 72px)",
          transform: "rotate(-18deg)",
          filter: "blur(2px)",
          opacity: 0.88,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "linear-gradient(90deg, rgba(8,8,10,1) 0%, rgba(8,8,10,.94) 36%, rgba(8,8,10,.1) 75%, rgba(8,8,10,.25) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "58px 62px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 28,
              height: 28,
              border: "6px solid #f7f5ef",
              borderRightColor: "#ff4d00",
              borderRadius: "50%",
              transform: "rotate(-38deg)",
            }}
          />
          <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "0.17em" }}>
            CHURN
          </div>
          <div
            style={{
              display: "flex",
              padding: "5px 9px",
              border: "1px solid rgba(247,245,239,.5)",
              fontSize: 13,
              letterSpacing: "0.12em",
            }}
          >
            PLAYER
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 82, fontWeight: 600, letterSpacing: "-0.06em" }}>
            Music, visualized.
          </div>
          <div style={{ marginTop: 18, fontSize: 26, color: "rgba(247,245,239,.65)" }}>
            Powered by Butterchurn and classic MilkDrop presets.
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
