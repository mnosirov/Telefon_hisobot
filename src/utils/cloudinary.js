const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Upload a single file to Cloudinary
 * @param {File} file - The file to upload
 * @param {string} folder - Optional folder name (e.g., 'phones', 'documents')
 * @returns {Promise<string>} - The secure URL of the uploaded file
 */
export const uploadToCloudinary = async (file, folder = 'phones') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Rasm yuklashda xato');
  }

  const data = await res.json();
  return data.secure_url;
};

/**
 * Upload multiple files to Cloudinary
 * @param {File[]} files - Array of files
 * @param {string} folder - Optional folder name
 * @returns {Promise<string[]>} - Array of secure URLs
 */
export const uploadMultipleToCloudinary = async (files, folder = 'phones') => {
  const uploads = files.map((file) => uploadToCloudinary(file, folder));
  return Promise.all(uploads);
};
