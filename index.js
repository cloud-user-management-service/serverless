const AWS = require('aws-sdk');
const sgMail = require('@sendgrid/mail');
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

const dbSecretName = process.env.DB_SECRET_NAME;
const emailSecretName = process.env.EMAIL_SECRET_NAME;
const secretsManager = new AWS.SecretsManager();


const emailFrom = process.env.EMAIL_FROM;


exports.handler = async (event, context, callback) => {

    // Get email credentials from Secrets Manager
    const emailSecretResponse = await secretsManager
    .getSecretValue({ SecretId: emailSecretName })
    .promise();
    const emailSecret = JSON.parse(emailSecretResponse.SecretString);           
    sgMail.setApiKey(emailSecret.password);
    sgMail.setTimeout(300000);

    console.log(`Retrieved email credentials: password = ${emailSecret.password}`);

    // Get database credentials from Secrets Manager
    const passwordSecretResponse = await secretsManager
    .getSecretValue({ SecretId: dbSecretName })
    .promise();
    const dbSecret = JSON.parse(passwordSecretResponse.SecretString);
    console.log(`Retrieved database credentials: password = ${dbSecret.password}`);

    context.callbackWaitsForEmptyEventLoop = false;
    console.log('event1:', event);
    const connection = await mysql.createConnection({
        host: process.env.RDS_HOST,
        port: process.env.RDS_PORT,
        user: process.env.RDS_USER,
        password: dbSecret.password,
        database: process.env.RDS_NAME,
      });

    try {
        console.log('host:', process.env.RDS_HOST);
        console.log('event:', event);
        console.log('context:', context);

        const message = JSON.parse(event.Records[0].Sns.Message);
        console.log('message:', message);
        const {userId, email} = message;

        const token = uuidv4();
        const expiresTime = new Date(Date.now() + 2 * 60 * 1000);
        const id = uuidv4();

        // save token to database
        await connection.execute(
            `INSERT INTO EmailVerification (id, email, token, expireTime, user_id) VALUES (?, ?, ?, ?, ?)`,
            [id, email, token, expiresTime, userId]
        );

        // send email to user for verification
        const verificationLink = `${process.env.BASE_URL}/v1/user/verify?email=${email}&token=${token}`;

        console.log('verificationLink:', verificationLink);

        const msg = {
            to: email,
            from: emailFrom,
            subject: 'Email Verification',
            text: `Please verify your email using the following link: ${verificationLink}`,
            html: `<p>Please verify your email using the following link:</p><a href="${verificationLink}">verify link here</a>`,
        };

        console.log('msg:', msg);

        // send email
        const ret = await sgMail.send(msg);
        console.log('ret:', ret);
        console.log(`Verification email sent to ${email}`);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Email sent successfully!' }),
        };
    } catch (error) {
        console.log('Error sending email:', error);

        if (error.response) {
            console.log('Error response:', error.response.body);
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to send email.' }),
        };
    } finally {
        console.log('Closing connection');
        connection.end();
    }
};
