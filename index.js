const sgMail = require('@sendgrid/mail');
const mysql = require("mysql2/promise");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const emailFrom = process.env.EMAIL_FROM;
const { v4: uuidv4 } = require("uuid");


exports.handler = async (event, context, callback) => {
    const connection = await mysql.createConnection({
        host: process.env.RDS_HOST,
        port: process.env.RDS_PORT,
        user: process.env.RDS_USER,
        password: process.env.RDS_PASSWORD,
        database: process.env.RDS_NAME,
      });

    try {
        console.log('event:', event);
        console.log('context:', context);

        const message = JSON.parse(event.Records[0].Sns.Message);
        console.log('message:', message);
        const {userId, email} = message;

        const token = uuidv4();
        const expiresTime = new Date(Date.now() + 2 * 60 * 1000);

        // save token to database
        await connection.execute(
            `INSERT INTO EmailVerification (user_id, email, token, expires_time) VALUES (?, ?, ?, ?)`,
            [userId, email, token, expiresTime]
        );

        // send email to user for verification
        const verificationLink = `${process.env.BASE_URL}/v1/user/verify?email=${email}&token=${token}`;

        const msg = {
            to: email,
            from: emailFrom,
            subject: 'Email Verification',
            text: `Please verify your email using the following link: ${verificationLink}`,
            html: `<p>Please verify your email using the following link:</p><a href="${verificationLink}">${verificationLink}</a>`,
        };

        // send email
        await sgMail.send(msg);
        console.log(`Verification email sent to ${email}`);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Email sent successfully!' }),
        };
    } catch (error) {
        console.error('Error sending email:', error);

        if (error.response) {
            console.error('Error response:', error.response.body);
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to send email.' }),
        };
    } finally {
        connection.end();
    }
};
