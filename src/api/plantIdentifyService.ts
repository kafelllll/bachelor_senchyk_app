export type PlantIdentifyPayload = {
  imageBase64?: string;
  images?: string[];
  modifiers?: string[];
};

export type PlantIdentifyResponse = Record<string, unknown>;

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export const plantIdentifyService = {
  async identify(payload: PlantIdentifyPayload): Promise<PlantIdentifyResponse> {
    const response = await fetch(`${API_BASE_URL}/plants/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMessage = 'Не вдалося визначити рослину.';
      
      const data = await response.json().catch(() => null);
      if (data?.message) {
        errorMessage = data.message;
      } else {
        switch (response.status) {
          case 400:
            errorMessage = 'Невалідні дані для визначення. Переконайтесь, що фото хорошої якості.';
            break;
          case 401:
            errorMessage = 'Ви не авторизовані для використання сервісу визначення.';
            break;
          case 403:
            errorMessage = 'Вичерпав ліміт запитів на визначення. Спробуйте пізніше.';
            break;
          case 404:
            errorMessage = 'Рослина не розпізнана. Спробуйте інше фото.';
            break;
          case 500:
            errorMessage = 'Помилка сервера при визначенні рослини.';
            break;
          case 503:
            errorMessage = 'Сервіс визначення тимчасово недоступний.';
            break;
        }
      }
      throw new Error(errorMessage);
    }

    return (await response.json()) as PlantIdentifyResponse;
  },
};
