import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UploadImage from '../UploadImage';

describe('UploadImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows validation error for unsupported file type', async () => {
    render(<UploadImage />);
    const input = document.getElementById('upload-image-input') as HTMLInputElement;

    const badFile = new File(['bad'], 'bad.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [badFile] } });

    expect(
      await screen.findByText('Дозволено лише зображення у форматах JPEG, PNG або WEBP.')
    ).toBeInTheDocument();
  });

  it('uploads valid file with mocked flow and calls onUpload callback', async () => {
    const onUpload = vi.fn();

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://upload.example.com/s3-put',
          fileUrl: 'https://cdn.example.com/plants/leaf.jpg',
          key: 'plants/leaf.jpg',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    vi.stubGlobal('fetch', fetchMock);

    render(<UploadImage onUpload={onUpload} />);
    const input = document.getElementById('upload-image-input') as HTMLInputElement;

    const goodFile = new File(['ok'], 'leaf.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [goodFile] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onUpload).toHaveBeenCalledWith(
        'https://cdn.example.com/plants/leaf.jpg',
        'plants/leaf.jpg'
      );
    });
  });
});
