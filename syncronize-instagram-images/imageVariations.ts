//import { AWS } from 'aws-lambda';

import AWS from 'aws-sdk';
import { S3Event, S3Handler } from 'aws-lambda';
import sharp, { AvailableFormatInfo, FormatEnum } from 'sharp';
import { basename, extname } from 'path';

const s3 = new AWS.S3();

export const lambdaHandler: S3Handler = async (event: S3Event) => {
    const { Records } = event;
    for (const record of Records) {
        const bucket = record.s3.bucket.name;
        const file = record.s3.object.key;
        console.log(`Processing file ${file} from bucket ${bucket}`);
        await main(bucket, file);
    }
    return;
};

async function main(bucket: string, file: string) {
    console.log('main initiated');
    const formats: (keyof FormatEnum | AvailableFormatInfo)[] = ['jpg', 'webp', 'avif'];
    const sizes = [320, 480, 768, 1024, 1280, 1920];
    const image = await s3.getObject({ Bucket: bucket, Key: file }).promise();

    interface Size {
        size: number;
        path: string;
    }

    interface ImageVariant {
        format: keyof FormatEnum | AvailableFormatInfo;
        sizes: Size[];
    }

    interface ImageData {
        id: string;
        description: string;
        variants: ImageVariant[];
    }

    let images: Record<string, ImageData> = {};

    try {
        const existingImagesData = await s3.getObject({ Bucket: bucket, Key: 'images.json' }).promise();
        if (existingImagesData.Body) {
            images = JSON.parse(existingImagesData.Body.toString());
        }
    } catch (error) {
        console.log('No existing images.json found, creating a new one');
    }

    const imageId = basename(file, extname(file));

    if (!images.hasOwnProperty(imageId)) {
        images[imageId] = {
            id: imageId,
            description: '',
            variants: [],
        };
    }

    for (const format of formats) {
        const variant: ImageVariant = {
            format: format,
            sizes: [],
        };

        for (const size of sizes) {
            console.log(`Processing ${file} ${format} ${size}`);
            const optimizedImage = await sharp(image.Body as Buffer)
                .resize(size)
                .toFormat(format, { progressive: true })
                .toBuffer();
            const imageKey = `optimized/${imageId}_${size}.${format}`;
            await s3
                .upload({
                    Bucket: bucket,
                    Key: imageKey,
                    Body: optimizedImage,
                    Metadata: {
                        'Content-Type': `image/${format}`,
                        'Content-Disposition': `attachment; filename="${imageKey}"`,
                    },
                })
                .promise();

            variant.sizes.push({
                size: size,
                path: imageKey,
            });
        }

        images[imageId].variants.push(variant);
    }

    const imagesJson = JSON.stringify(images);
    await s3
        .upload({
            Bucket: bucket,
            Key: 'images.json',
            Body: imagesJson,
            Metadata: {
                'Content-Disposition': 'attachment; filename=images.json',
                'Content-Type': 'application/json',
            },
        })
        .promise();

    console.log('images.json file updated and uploaded successfully');
}
