// file uploading thing
const MAX_FILE_SIZE = 1024 * 1024; 
const MAX_IMAGE_DIMENSION = 512; 


async function compressImage(base64Image, shouldCompress = true) {
    if (!shouldCompress) {
        return base64Image;
    }
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            const needsResize = width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;
            
            if (needsResize) {
                const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            let hasTransparency = false;
            
            for (let i = 3; i < imageData.data.length; i += 4) {
                if (imageData.data[i] < 255) {
                    hasTransparency = true;
                    break;
                }
            }
            
            let compressed;
            if (hasTransparency) {
                compressed = canvas.toDataURL('image/png', 0.9); 
            } else {
                compressed = canvas.toDataURL('image/jpeg', 0.8);
            }
            
            resolve(compressed);
        };
        img.onerror = reject;
        img.src = base64Image;
    });
}


function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

let isCssInjected = false;

function injectFileUploadCss() {
    if (isCssInjected) return;
    isCssInjected = true;

    const style = document.createElement('style');
    style.id = 'rovalra-global-fileupload-style';
    style.textContent = `
        .rovalra-fileupload-wrapper {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-left: auto;
            max-width: 250px;
        }
        .rovalra-fileupload-controls {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .rovalra-fileupload-filename {
            font-size: 12px;
            color: var(--text-secondary);
            max-width: 150px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .rovalra-fileupload-preview {
            display: none;
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            padding: 8px;
            border: 1px solid var(--border-default);
            border-radius: 8px;
            background-color: var(--surface-default);
        }
        .rovalra-fileupload-preview.visible {
            display: flex;
        }
        .rovalra-fileupload-preview img {
            max-width: 100%;
            max-height: 150px;
            border-radius: 4px;
            object-fit: contain;
            align-self: flex-start;
        }
        .rovalra-fileupload-size {
            font-size: 11px;
            color: var(--text-secondary);
        }
        .rovalra-fileupload-error {
            font-size: 11px;
            color: var(--color-status-error);
            margin-top: 4px;
        }
    `;
    document.head.appendChild(style);
}


export function createFileUpload({ id, accept = 'image/*', compress = true, compressSettingName, onFileSelect, onFileClear }) {
    injectFileUploadCss();

    const wrapper = document.createElement('div');
    wrapper.className = 'rovalra-fileupload-wrapper';

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'rovalra-fileupload-controls';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = id;
    fileInput.accept = accept;
    fileInput.style.display = 'none';

    const triggerButton = document.createElement('button');
    triggerButton.type = 'button';
    triggerButton.id = `${id}-trigger`;
    triggerButton.className = 'rovalra-fileupload-trigger relative clip group/interactable focus-visible:outline-focus disabled:outline-none flex items-center justify-between width-full bg-none stroke-standard radius-medium height-1000 padding-x-medium text-body-medium stroke-default content-default';

    const presentationDiv = document.createElement('div');
    presentationDiv.setAttribute('role', 'presentation');
    presentationDiv.className = 'absolute inset-[0] transition-colors group-hover/interactable:bg-[var(--color-state-hover)] group-active/interactable:bg-[var(--color-state-press)] group-disabled/interactable:bg-none';

    const textWrapper = document.createElement('div');
    textWrapper.className = 'grow-1 text-truncate-split text-align-x-left';

    const triggerValue = document.createElement('span');
    triggerValue.className = 'text-no-wrap text-truncate-split content-emphasis';
    triggerValue.style.pointerEvents = 'none';
    triggerValue.textContent = 'Upload File';
    textWrapper.appendChild(triggerValue);

    const fileNameDisplay = document.createElement('span');
    fileNameDisplay.id = `${id}-filename`;
    fileNameDisplay.className = 'rovalra-fileupload-filename';
    fileNameDisplay.style.display = 'none';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.id = `${id}-clear`;
    clearButton.className = 'btn-control-xs rovalra-fileupload-clear';
    clearButton.innerHTML = '<span class="icon-close"></span>';
    clearButton.style.display = 'none';

    const previewContainer = document.createElement('div');
    previewContainer.className = 'rovalra-fileupload-preview';
    
    const previewImage = document.createElement('img');
    previewImage.alt = 'File preview';
    
    const fileSizeDisplay = document.createElement('span');
    fileSizeDisplay.className = 'rovalra-fileupload-size';
    
    previewContainer.append(previewImage, fileSizeDisplay);

    const errorMessage = document.createElement('span');
    errorMessage.className = 'rovalra-fileupload-error';
    errorMessage.style.display = 'none';

    triggerButton.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            
            errorMessage.style.display = 'none';
            errorMessage.textContent = '';
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target.result;
                    
                    if (!base64Data || !base64Data.startsWith('data:image/')) {
                        errorMessage.textContent = 'Invalid file format. Please upload a valid image.';
                        errorMessage.style.display = 'block';
                        fileInput.value = '';
                        clearPreview();
                        return;
                    }
                    
                    let shouldCompress = compress;
                    if (compressSettingName) {
                        const result = await chrome.storage.local.get([compressSettingName]);
                        shouldCompress = result[compressSettingName] !== false; 
                    }
                    
                    let finalData = base64Data;
                    if (file.type.startsWith('image/')) {
                        finalData = await compressImage(base64Data, shouldCompress);
                    }
                    
                    if (!finalData || !finalData.startsWith('data:image/')) {
                        errorMessage.textContent = 'Image processing failed. Please try another file.';
                        errorMessage.style.display = 'block';
                        fileInput.value = '';
                        clearPreview();
                        return;
                    }
                    
                    const finalSize = Math.round((finalData.length * 3) / 4); 
                    
                    if (finalSize > MAX_FILE_SIZE) {
                        const errorMsg = shouldCompress 
                            ? `File too large even after compression. Size: ${formatFileSize(finalSize)}, maximum: ${formatFileSize(MAX_FILE_SIZE)}.`
                            : `File too large. Size: ${formatFileSize(finalSize)}, maximum: ${formatFileSize(MAX_FILE_SIZE)}. Enable compression to reduce file size.`;
                        errorMessage.textContent = errorMsg;
                        errorMessage.style.display = 'block';
                        fileInput.value = '';
                        clearPreview();
                        return;
                    }
                    
                    setPreview(finalData, finalSize);
                    
                    onFileSelect(finalData);
                } catch (error) {
                    console.error('Error processing image:', error);
                    errorMessage.textContent = 'Error processing image. Please try another file.';
                    errorMessage.style.display = 'block';
                    fileInput.value = '';
                    clearPreview();
                }
            };
            reader.readAsDataURL(file);
        }
    });

    if (onFileClear) {
        clearButton.addEventListener('click', () => {
            fileInput.value = ''; 
            clearPreview();
            onFileClear();
        });
    }

    triggerButton.append(presentationDiv, textWrapper);
    controlsContainer.append(fileNameDisplay, clearButton, triggerButton);
    wrapper.append(controlsContainer, errorMessage, fileInput);

    const setFileName = (name) => {
        if (name) {
            fileNameDisplay.textContent = name;
            fileNameDisplay.style.display = 'inline';
            triggerValue.textContent = 'Change';
        } else {
            fileNameDisplay.style.display = 'none';
            triggerValue.textContent = 'Upload File';
        }
    };

    const showClear = (visible) => {
        clearButton.style.display = visible ? 'inline-flex' : 'none';
    };

    const setPreview = (base64Data, sizeInBytes) => {
        previewImage.src = base64Data;
        fileSizeDisplay.textContent = formatFileSize(sizeInBytes);
        previewContainer.classList.add('visible');
    };

    const clearPreview = () => {
        previewImage.src = '';
        fileSizeDisplay.textContent = '';
        previewContainer.classList.remove('visible');
    };

    const getPreviewElement = () => {
        return previewContainer;
    };

    const showError = (message) => {
        errorMessage.textContent = message;
        errorMessage.style.display = message ? 'block' : 'none';
    };

    const componentApi = { setFileName, showClear, setPreview, clearPreview, showError, getPreviewElement };
    wrapper.rovalraFileUpload = componentApi;

    return { element: wrapper, ...componentApi };
}