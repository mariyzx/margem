import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Margem",
    short_name: "Margem",
    description: "Um caderno que te faz lembrar, não só reler.",
    start_url: "/revisar",
    display: "standalone",
    background_color: "#eceef3",
    theme_color: "#2747d9",
    lang: "pt-BR",
  };
}
