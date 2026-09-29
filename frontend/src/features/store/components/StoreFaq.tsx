import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { tr } from '@/i18n';

const FAQ = [
  {
    q: tr('Qanday buyurtma beraman?'),
    a: tr("Mahsulotni oching, o'lcham, rang va miqdorni tanlab savatga qo'shing. Savatda ism va telefon raqamingizni yozib, karta orqali to'lang. Buyurtma darhol zavodga yetib boradi."),
  },
  {
    q: tr("Ro'yxatdan o'tishim kerakmi?"),
    a: tr("Yo'q. Buyurtma uchun ism va telefon raqami yetarli. Buyurtmalaringiz shu qurilmada «Buyurtmalarim» bo'limida saqlanadi."),
  },
  {
    q: tr('Yetkazib berish qanday bo\'ladi?'),
    a: tr("To'lovdan keyin zavod siz bilan telefon orqali bog'lanadi va yetkazib berish usuli, muddati hamda narxini kelishadi."),
  },
  {
    q: tr("O'lchamni qanday tanlayman?"),
    a: tr("Har bir mahsulotda mavjud o'lchamlar ko'rsatilgan. Ikkilansangiz, zavod sahifasidagi «Savol berish» tugmasi orqali so'rang yoki AI yordamchidan maslahat oling."),
  },
  {
    q: tr('Buyurtmam holatini qayerdan bilaman?'),
    a: tr("Yuqoridagi «Buyurtmalarim» bo'limida. Boshqa qurilmadan buyurtma raqami va telefon orqali topish mumkin. Telegram bot orqali buyurtma bersangiz, holat o'zgarganda xabar keladi."),
  },
  {
    q: tr('Ulgurji (katta hajmda) buyurtma bersa bo\'ladimi?'),
    a: tr("Ha. Zavod sahifasidagi «Savol berish» tugmasi orqali kerakli miqdorni yozing — zavod narx va muddatni siz bilan alohida kelishadi."),
  },
];

export default function StoreFaq() {
  return (
    <Box component="section" sx={{ mt: { xs: 6, md: 9 } }}>
      <Typography variant="h4" sx={{ fontSize: { xs: 26, md: 32 }, mb: 1 }}>
        {tr("Ko'p so'raladigan savollar")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {tr("Javob topmasangiz — AI yordamchidan so'rang yoki zavodga savol yuboring.")}
      </Typography>
      <Box>
        {FAQ.map((item) => (
          <Accordion key={item.q} disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', '&:not(:last-of-type)': { borderBottom: 0 }, '&::before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>{item.q}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography color="text.secondary">{item.a}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}
