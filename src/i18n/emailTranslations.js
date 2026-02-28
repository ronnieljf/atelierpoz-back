/**
 * Traducciones para correos electrónicos (registro y recuperación de contraseña)
 * Locales soportados: es, en
 */

export const emailTranslations = {
  es: {
    register: {
      subject: 'Verifica tu correo - Atelier Poz',
      title: 'Verifica tu correo electrónico',
      greeting: (name) => (name ? `Hola ${name},` : ''),
      intro: 'Usa el siguiente código para completar tu registro:',
      expiry: 'El código expira en 15 minutos. Si no solicitaste este registro, ignora este correo.',
      text: (code) => `Tu código de verificación es: ${code}. Expira en 15 minutos.`,
    },
    passwordReset: {
      subject: 'Recupera tu contraseña - Atelier Poz',
      title: 'Recuperar contraseña',
      greeting: (name) => (name ? `Hola ${name},` : ''),
      intro: 'Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código:',
      expiry: 'El código expira en 15 minutos. Si no solicitaste este cambio, ignora este correo. Tu contraseña no se modificará.',
      text: (code) => `Tu código para recuperar contraseña es: ${code}. Expira en 15 minutos.`,
    },
    platform: 'Plataforma para tu negocio',
    footer: (year) => `© ${year} Atelier Poz · Todos los derechos reservados`,
  },
  en: {
    register: {
      subject: 'Verify your email - Atelier Poz',
      title: 'Verify your email',
      greeting: (name) => (name ? `Hi ${name},` : ''),
      intro: 'Use the following code to complete your registration:',
      expiry: 'The code expires in 15 minutes. If you did not request this registration, ignore this email.',
      text: (code) => `Your verification code is: ${code}. It expires in 15 minutes.`,
    },
    passwordReset: {
      subject: 'Recover your password - Atelier Poz',
      title: 'Recover password',
      greeting: (name) => (name ? `Hi ${name},` : ''),
      intro: 'We received a request to reset your password. Use the following code:',
      expiry: 'The code expires in 15 minutes. If you did not request this change, ignore this email. Your password will not be modified.',
      text: (code) => `Your password recovery code is: ${code}. It expires in 15 minutes.`,
    },
    platform: 'Platform for your business',
    footer: (year) => `© ${year} Atelier Poz · All rights reserved`,
  },
};

export function getEmailTranslations(locale) {
  const lang = locale === 'en' ? 'en' : 'es';
  return emailTranslations[lang];
}
