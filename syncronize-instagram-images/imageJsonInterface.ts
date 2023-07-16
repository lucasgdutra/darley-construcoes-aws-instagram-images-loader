import { AvailableFormatInfo, FormatEnum } from 'sharp';

export interface Size {
    size: number;
    path: string;
}

export interface ImageVariant {
    format: keyof FormatEnum | AvailableFormatInfo;
    sizes: Size[];
}

export interface ImageData {
    id: string;
    description: string;
    variants: ImageVariant[];
}

export interface ImageJsonInterface {
    [key: string]: ImageData;
}
