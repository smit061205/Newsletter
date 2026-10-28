import { FlFront, flMeta } from "@/views/Flagship.tsx";

export const revalidate = 600;
export const generateMetadata = () => flMeta("gu", "");
export default function Page() { return <FlFront lang="gu" />; }
