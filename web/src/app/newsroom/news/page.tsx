"use client";
// The press releases now live under Stories (its second tab).
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function News() {
  const router = useRouter();
  useEffect(() => { router.replace("/newsroom/stories?tab=sources"); }, [router]);
  return null;
}
