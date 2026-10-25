import Home from "@/views/Home.tsx";
import { pageMeta } from "@/lib/meta.ts";

export const revalidate = 3600;
export const metadata = pageMeta({ lang: "en", path: "/" });
export default function Page() { return <Home lang="en" />; }
