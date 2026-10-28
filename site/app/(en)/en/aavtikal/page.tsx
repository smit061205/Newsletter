import { FlFront, flMeta } from "@/views/Flagship.tsx";

export const revalidate = 600;
export const generateMetadata = () => flMeta("en", "");
export default function Page() { return <FlFront lang="en" />; }
