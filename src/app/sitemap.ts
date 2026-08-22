import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://churn.leyanlo.com",
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://churn.leyanlo.com/credits",
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
