import type { Metadata } from "next";
import Link from "next/link";
import styles from "./credits.module.css";

export const metadata: Metadata = {
  title: "Credits and licenses — Churn",
  description: "Project lineage, artist attribution, and third-party licenses for Churn.",
};

const mitLicense = `MIT License

Copyright (c) 2013-2018 Jordan Berg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export default function CreditsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/">
          ← Return to Churn
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>CHURN</p>
          <h1>Credits and licenses</h1>
          <p>
            Churn is an unofficial browser interface powered by existing open-source
            rendering software and classic artist-created presets.
          </p>
        </header>

        <section className={styles.section}>
          <h2>What Churn adds</h2>
          <p>
            Churn adds a responsive interface, browser audio-source integrations,
            input diagnostics, preset controls, compatibility testing, and deployment.
            It does not implement the MilkDrop renderer or create the bundled visuals.
          </p>
          <p>
            Churn is not an official MilkDrop project and is not a port of MilkDrop3.
            MilkDrop3 inspired parts of the original experiment, but none of its native
            implementation powers this application.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Project lineage</h2>
          <ul>
            <li>
              <a href="https://www.geisswerks.com/milkdrop/">MilkDrop</a> was created
              by Ryan Geiss.
            </li>
            <li>
              <a href="https://github.com/jberg/butterchurn">Butterchurn</a>, the
              WebGL 2 renderer used by Churn, was created by Jordan Berg and
              contributors.
            </li>
            <li>
              <a href="https://github.com/jberg/butterchurn-presets">
                Butterchurn Presets
              </a>{" "}
              contains converted classic MilkDrop presets. The preset names shown in
              Churn retain their original artist credits.
            </li>
            <li>
              <a href="https://github.com/milkdrop2077/MilkDrop3">MilkDrop3</a>,
              developed by milkdrop2077 and based on BeatDrop by Maxim Volskiy,
              inspired the experiment that led to Churn. Its code is not included.
            </li>
            <li>
              Churn&apos;s interface, browser integrations, validation, and deployment
              were developed by Leyan Lo with OpenAI Codex.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Preset artists</h2>
          <p>
            The bundled visuals are works by many MilkDrop preset artists. Churn shows
            the original creator and remix credits embedded in each preset name; it
            does not claim authorship of those visuals.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Butterchurn license</h2>
          <pre>{mitLicense}</pre>
        </section>

        <section className={styles.section}>
          <h2>Butterchurn Presets license</h2>
          <pre>{mitLicense}</pre>
        </section>
      </div>
    </main>
  );
}
