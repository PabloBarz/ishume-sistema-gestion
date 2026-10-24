SELECT
    p.id_producto,
    p.sku,
    c.nombre_categoria AS categoria,
    d.nombre_diseno AS disenio,
    m.nombre_modelo AS modelo,
    m.nivel_educativo,
    p.precio,
    p.stock_actual
FROM inventario_productos AS p
INNER JOIN modelos AS m
    ON p.id_modelo = m.id_modelo
INNER JOIN disenios AS d
    ON m.id_diseno = d.id_diseno
INNER JOIN categorias AS c
    ON d.id_categoria = c.id_categoria
ORDER BY c.nombre_categoria, m.nivel_educativo, m.nombre_modelo;