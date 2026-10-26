type PhoneLinkProps = {
  phone?: string | null;
  className?: string;
};

export default function PhoneLink({ phone, className }: PhoneLinkProps) {
  if (!phone?.trim()) return null;

  const telephoneNumber = phone.trim().replace(/[^\d+]/g, '');
  if (!/\d/.test(telephoneNumber)) return <span className={className}>{phone}</span>;

  return (
    <a aria-label={`Call ${phone}`} className={className} href={`tel:${telephoneNumber}`}>
      {phone}
    </a>
  );
}
