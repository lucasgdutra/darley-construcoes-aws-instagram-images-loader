import AWS, { AWSError, DynamoDB } from 'aws-sdk';
import { DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda';
import { ImageJsonInterface, ImageData } from './imageJsonInterface';

const s3 = new AWS.S3();
const s3_bucket = process.env.S3_BUCKET as string;
const s3_key = process.env.S3_KEY as string;

if (!s3_bucket) {
    throw new Error('S3_BUCKET is not defined');
}

if (!s3_key) {
    throw new Error('S3_KEY is not defined');
}

export const lambdaHandler: DynamoDBStreamHandler = async (event: DynamoDBStreamEvent) => {
    try {
        for (const record of event.Records) {
            // Check if this is a new image
            if (record.eventName !== 'INSERT') continue;

            if (!record.dynamodb?.NewImage) {
                console.error('No NewImage found in record:', record);
                continue;
            }
            const image = DynamoDB.Converter.unmarshall(record.dynamodb.NewImage) as ImageData;

            // Retrieve the current contents of the images.json file
            const existingData = await getExistingImagesData();

            // Update the data with the new image
            const updatedData: ImageJsonInterface = { ...existingData, [image.id]: image };

            // Convert the data to JSON string
            const jsonData = JSON.stringify(updatedData, null, 2);

            // Write the updated data to the images.json file in S3
            await writeDataToS3(jsonData);
        }

        console.log('Images processed successfully');
    } catch (error) {
        console.error('Error processing images:', error);
    }
};

async function getExistingImagesData(): Promise<ImageJsonInterface> {
    let existingData: ImageJsonInterface = {};
    try {
        const params = {
            Bucket: s3_bucket,
            Key: s3_key,
        };

        const response = await s3.getObject(params).promise();
        if (response.Body) {
            existingData = JSON.parse(response.Body.toString());
        }
        return existingData;
    } catch (error) {
        // Handle the case when the images.json file doesn't exist yet
        if ((error as AWSError).code === 'NoSuchKey') {
            return {};
        }

        throw error;
    }
}

async function writeDataToS3(data: string) {
    const params = {
        Bucket: s3_bucket,
        Key: s3_key,
        Body: data,
        Metadata: {
            'Content-Disposition': `attachment; filename=${s3_key}`,
            'Content-Type': 'application/json',
        },
    };

    await s3.putObject(params).promise();
}
