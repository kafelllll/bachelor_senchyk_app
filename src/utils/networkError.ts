export const getNetworkErrorMessage = (error: unknown): string => {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    if (message.includes('fetch') || message.includes('network')) {
      return "Помилка мережі. Перевірте своє інтернет з'єднання.";
    }
    if (message.includes('timeout')) {
      return 'Часовий ліміт запиту вичерпано. Спробуйте ще раз.';
    }
    if (message.includes('cors')) {
      return 'Помилка безпеки при звернені до сервера. Спробуйте пізніше.';
    }
  }
  return 'Не вдалося підключитися до сервера. Спробуйте пізніше.';
};
