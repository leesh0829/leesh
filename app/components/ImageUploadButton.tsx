"use client";

import { useRef, useState } from "react";

export default function ImageUploadButton({
  onUploaded,
  disabled,
}: {
  onUploaded: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = () => inputRef.current?.click();

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message ?? "업로드 실패");
        return;
      }

      const url = data?.url as string | undefined;
      if (!url) {
        alert("업로드 실패: url 없음");
        return;
      }

      onUploaded(url);
    } finally {
      setUploading(false);
      // 같은 파일 다시 선택 가능하게
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onChange}
      />
      <button type="button" onClick={pick} disabled={disabled || uploading}>
        {uploading ? "업로드중..." : "이미지 업로드"}
      </button>
    </>
  );
}
