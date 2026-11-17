// Generado con asistencia de IA (Claude)
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { RentalCheckout } from '../src/components/RentalCheckout';
import { RentalRequest, type RentalChoice, type RentalItem } from '../src/components/RentalRequest';
import type { Reservation } from '../src/services/rentalService';

// Las fechas y la entrega del panel de la ficha y, al continuar, el resumen y el pago de
// «Confirmar y pagar» (US-07.01), sin la carga de la ficha ni de la página. Las rutas de verdad se
// prueban en itemDetail.test.tsx y confirmRental.test.tsx.
export function RentalFlow({
  item,
  onRequested,
  onSessionExpired,
}: {
  item: RentalItem;
  onRequested: (reservation: Reservation) => void;
  onSessionExpired: () => void;
}) {
  const [choice, setChoice] = useState<RentalChoice | null>(null);
  return (
    <MemoryRouter>
      {choice ? (
        <RentalCheckout
          item={item}
          startDate={choice.startDate}
          endDate={choice.endDate}
          delivery={choice.delivery}
          datesPath={`/objetos/${item.id}`}
          onRequested={onRequested}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <RentalRequest item={item} onContinue={setChoice} onSessionExpired={onSessionExpired} />
      )}
    </MemoryRouter>
  );
}
