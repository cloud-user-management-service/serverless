const sgMail = require('@sendgrid/mail');
const mysql = require("mysql2/promise");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
sgMail.setTimeout(300000);
const emailFrom = process.env.EMAIL_FROM;
const { v4: uuidv4 } = require("uuid");


exports.handler = async (event, context, callback) => {

    context.callbackWaitsForEmptyEventLoop = false;
    console.log('event1:', event);
    const connection = await mysql.createConnection({
        host: process.env.RDS_HOST,
        port: process.env.RDS_PORT,
        user: process.env.RDS_USER,
        password: process.env.RDS_PASSWORD,
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
