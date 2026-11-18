-- Reversão: tira a coleção "adicionais" do registro. Só use se não houver lançamentos nela.
delete from seg.colecoes where raiz = 'adicionais';
