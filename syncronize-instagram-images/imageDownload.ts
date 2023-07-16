//import { AWS } from 'aws-lambda';
import axios from 'axios';
import AWS from 'aws-sdk';

const s3 = new AWS.S3();
const s3_bucket = 'darley-construcoes-instagram-images';
const user_access_token = process.env.INSTAGRAM_ACCESS_TOKEN as string;
const tags = ['industrial', 'comercial', 'residencial'];

export const lambdaHandler = async () => {
    await main();
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Instagram images processed successfully!' }),
    };
};

// Store media URLs in an array
let existingImages: string[] = [];

const loadExistingImagesInBucket = async () => {
    try {
        existingImages = (await s3
            .listObjects({ Bucket: s3_bucket, Prefix: 'original/' })
            .promise()
            .then((data) => {
                if (!data.Contents) {
                    return [];
                }
                return data.Contents.map((item) => item.Key?.replace(/\.\w+$/, '')).filter(
                    (item) => item !== undefined,
                );
            })) as string[];
    } catch (err) {
        console.error('Error loading existing images from S3 bucket:', err);
    }
};

const deleteImage = async (file_name: string) => {
    try {
        const params = { Bucket: s3_bucket, Key: file_name };
        await s3.deleteObject(params).promise();
        console.log(`Deleted image ${file_name}`);
    } catch (err) {
        console.error(`Error deleting image ${file_name} from S3 bucket`, err);
    }
};

const downloadImage = async (url: string) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const format = response.headers['content-type'].split('/')[1] || 'jpg';
    return {
        format,
        buffer: Buffer.from(response.data, 'binary'),
    };
};

const saveImage = async (imageBuffer: Buffer, file_name: string) => {
    const params = { Bucket: s3_bucket, Key: file_name, Body: imageBuffer };
    await s3.upload(params).promise();
    console.log(`File ${file_name} uploaded to S3 bucket ${s3_bucket}`);
};

const main = async () => {
    await loadExistingImagesInBucket();

    interface MediaData {
        id: string;
        caption: string;
        is_shared_to_feed: boolean;
        media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
        media_url: string;
        permalink: string;
        thumbnail_url: string;
        timestamp: string;
        username: string;
        children?: {
            data: {
                id: string;
            }[];
        };
    }
    interface InstagramMediaResponse {
        data: MediaData[];
        paging: {
            cursors: {
                before: string;
                after: string;
            };
        };
    }
    const response = await axios.get<InstagramMediaResponse>(
        `https://graph.instagram.com/me/media?fields=id,media_type,media_url,caption,children&access_token=${user_access_token}`,
    );
    const data = response.data.data;
    interface DownloadItem {
        url: string;
        file_name_without_extension: string;
    }
    const downloadList: DownloadItem[] = [];
    for (const item of data) {
        if (item.caption) {
            for (const tag of tags) {
                if (item.caption.toLowerCase().includes(tag)) {
                    if (item.media_type === 'CAROUSEL_ALBUM' && item.children) {
                        for (const child of item.children.data) {
                            const childResponse = await axios.get<MediaData>(
                                `https://graph.instagram.com/${child.id}?fields=media_url&access_token=${user_access_token}`,
                            );
                            downloadList.push({
                                url: childResponse.data.media_url,
                                file_name_without_extension: `original/${tag}_${item.id}`,
                            });
                        }
                    } else {
                        downloadList.push({
                            url: item.media_url,
                            file_name_without_extension: `original/${tag}_${item.id}`,
                        });
                    }
                }
            }
        }
    }

    function imageExists(imageName: string) {
        return existingImages.some((item) => item === imageName);
    }
    function imageDeleted(imageName: string) {
        return !downloadList.some((item) => item.file_name_without_extension === imageName);
    }
    console.log(
        'downloadList',
        downloadList.map((item) => item.file_name_without_extension),
    );
    for (const item of downloadList) {
        if (imageExists(item.file_name_without_extension)) {
            continue;
        }
        const { format, buffer } = await downloadImage(item.url);

        await saveImage(buffer, `${item.file_name_without_extension}.${format}`);
        existingImages.push(item.file_name_without_extension);
    }
    console.log('existingImages', existingImages);
    for (const imageName of existingImages) {
        if (imageDeleted(imageName)) {
            await deleteImage(imageName);
        }
    }
};
