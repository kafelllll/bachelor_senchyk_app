export interface PlantNetPlant {
  common_name?: string;
  scientific_name?: string;
  genus?: string;
  family?: string;
  description?: string;
  care_info?: string;
  image_url?: string;
}

const pickString = (...values: Array<unknown>): string | undefined =>
  values.find((value): value is string => typeof value === 'string' && value.trim() !== '');

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const resolveBackendPlants = (payload: unknown): PlantNetPlant[] => {
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  const candidate =
    (record.data as unknown) ??
    (record.plant as unknown) ??
    (record.result as unknown) ??
    payload;
  const list = Array.isArray(candidate) ? candidate : [candidate];

  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const plant = item as Record<string, unknown>;
      return {
        common_name: pickString(
          plant.common_name_uk,
          plant.commonNameUk,
          plant.common_name_ua,
          plant.commonNameUa,
          plant.common_name,
          plant.commonName
        ),
        scientific_name: pickString(
          plant.scientific_name_uk,
          plant.scientificNameUk,
          plant.scientific_name_ua,
          plant.scientificNameUa,
          plant.scientific_name,
          plant.scientificName
        ),
        genus: pickString(plant.genus_uk, plant.genusUk, plant.genus_ua, plant.genusUa, plant.genus),
        family: pickString(
          plant.family_uk,
          plant.familyUk,
          plant.family_ua,
          plant.familyUa,
          plant.family
        ),
        description: pickString(
          plant.description_uk,
          plant.descriptionUk,
          plant.description_ua,
          plant.descriptionUa,
          plant.description,
          plant.details
        ),
        care_info: pickString(
          plant.care_info_uk,
          plant.careInfoUk,
          plant.care_info_ua,
          plant.careInfoUa,
          plant.care_info,
          plant.careInfo,
          plant.care
        ),
        image_url:
          (plant.image_url as string) ??
          (plant.imageUrl as string) ??
          (plant.image as string) ??
          (plant.referenceImageUrl as string),
      };
    })
    .filter(
      (item) =>
        item.common_name ||
        item.scientific_name ||
        item.genus ||
        item.family ||
        item.description ||
        item.care_info ||
        item.image_url
    );
};

const searchByName = async (plantName: string): Promise<PlantNetPlant[]> => {
  const query = plantName.trim();
  if (!query) {
    throw new Error('Введіть назву рослини для пошуку.');
  }

  const url = new URL(`${API_BASE_URL}/plants/search`);
  url.searchParams.set('commonName', query);
  url.searchParams.set('name', query);

  const response = await fetch(url.toString(), {
    method: 'GET',
  });
  if (!response.ok) {
    let errorMessage = 'Не вдалося отримати дані про рослину.';
    
    const data = await response.json().catch(() => null);
    if (data?.message) {
      errorMessage = data.message;
    } else {
      switch (response.status) {
        case 400:
          errorMessage = 'Невалідна назва рослини.';
          break;
        case 404:
          errorMessage = `Рослина "${query}" не знайдена. Спробуйте іншу назву.`;
          break;
        case 500:
          errorMessage = 'Помилка при пошуку. Спробуйте пізніше.';
          break;
        case 503:
          errorMessage = 'Сервіс пошуку тимчасово недоступний.';
          break;
      }
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as unknown;
  return resolveBackendPlants(data);
};

const fetchByName = async (plantName: string): Promise<PlantNetPlant | null> => {
  const plants = await searchByName(plantName);
  return plants[0] ?? null;
};

export const plantNetService = {
  searchByName,
  fetchByName,
};
