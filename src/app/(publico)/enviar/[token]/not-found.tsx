import { Aviso } from "@/interface/componentes/indice";

/**
 * Token invalido OU revogado: a mesma tela, de proposito (ADR-033). Quem
 * escaneou nao tem como saber a diferenca, e dizer "revogado" confirmaria
 * que o token existiu.
 */
export default function QrNaoVale() {
  return (
    <Aviso tom="perigo" titulo="Este QR code não vale mais" urgente>
      Peça o QR code atual a quem cuida do financeiro da empresa. Nada foi enviado.
    </Aviso>
  );
}
