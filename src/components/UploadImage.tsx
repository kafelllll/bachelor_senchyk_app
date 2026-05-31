import { useRef, useState } from "react";

type UploadImageProps = {
  onUpload?: (url: string, key: string) => void;
  showPreview?: boolean;
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

const UploadImage = ({ onUpload, showPreview = true }: UploadImageProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const validateFile = (selectedFile: File | null) => {
    if (!selectedFile) {
      return "Оберіть файл.";
    }
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      return "Дозволено лише зображення у форматах JPEG, PNG або WEBP.";
    }
    if (selectedFile.size > MAX_SIZE_BYTES) {
      return "Розмір файлу має бути не більше 5 МБ.";
    }
    return "";
  };

  const handleUpload = async (selectedFile?: File | null) => {
    if (loading) {
      return;
    }
    const fileToUpload = selectedFile ?? file;
    const validationError = validateFile(fileToUpload);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!fileToUpload) {
      setError("Оберіть файл.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const presignedResponse = await fetch(
        `${API_BASE_URL}/api/uploads/presigned-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: fileToUpload.name,
            fileType: fileToUpload.type,
          }),
        }
      );

      if (!presignedResponse.ok) {
        throw new Error("Не вдалося отримати посилання для завантаження.");
      }

      const presignedData = await presignedResponse.json();
      const { uploadUrl, fileUrl, key } = presignedData as {
        uploadUrl?: string;
        fileUrl?: string;
        key?: string;
      };

      if (!uploadUrl || !fileUrl) {
        throw new Error("Сервер повернув некоректну відповідь.");
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": fileToUpload.type },
        body: fileToUpload,
      });

      if (!uploadResponse.ok) {
        throw new Error("Не вдалося завантажити файл у сховище.");
      }

      setImageUrl(fileUrl);
      if (typeof onUpload === "function") {
        onUpload(fileUrl, key || "");
      }
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (uploadError) {
      const isNetworkError =
        uploadError instanceof TypeError && uploadError.message === "Failed to fetch";
      const message = isNetworkError
        ? "Помилка мережі або CORS. Перевірте доступність API."
        : uploadError instanceof Error
        ? uploadError.message
        : "Не вдалося завантажити файл.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    const validationError = validateFile(selectedFile);
    setError(validationError);
    setFile(validationError ? null : selectedFile);
    setImageUrl("");
    if (!validationError && selectedFile) {
      void handleUpload(selectedFile);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Рекомендована якість: фото з шириною від 1200px для чіткого відображення.
      </p>
      <input
        id="upload-image-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={loading}
        ref={inputRef}
        className="hidden"
      />

      <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <label
          htmlFor="upload-image-input"
          className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-green-50 sm:w-auto"
        >
          Вибрати файл
        </label>
        <div className="flex h-11 min-w-0 w-full items-center rounded-xl border border-dashed border-gray-200 bg-slate-50 px-4 text-sm text-slate-600 sm:flex-1">
          {file ? `Обраний файл: ${file.name}` : "Файл не обрано"}
        </div>
        <span className="text-xs font-semibold text-slate-500 sm:shrink-0">
          {loading ? "Завантаження..." : "Автозавантаження після вибору"}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showPreview && imageUrl && (
        <img
          src={imageUrl}
          alt="Попередній перегляд завантаженого зображення"
          className="mt-2 h-48 w-full rounded-2xl object-cover"
        />
      )}
    </div>
  );
};

export default UploadImage;
