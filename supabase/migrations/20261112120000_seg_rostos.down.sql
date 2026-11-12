-- Reversão de 20261112120000_seg_rostos.sql. Os códigos dos rostos em public.docs (coleção "rostos")
-- ficam sem acesso para quem não é administrador; apagar esses registros exige pedido do dono.
delete from seg.colecoes where raiz = 'rostos';
