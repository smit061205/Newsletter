import { FlFront, flMeta } from "@/views/Flagship.tsx";

export const revalidate = 600;
export const generateMetadata = () => flMeta("hi", "");
export default function Page() { return <FlFront lang="hi" />; }
