import { AvailableFormatInfo, FormatEnum } from 'sharp';

export interface Size {
    size: number;
    path: string;
}

export type Formats = keyof FormatEnum | AvailableFormatInfo;

export interface ImageVariant {
    format: Formats;
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
