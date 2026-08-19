<?php
/*
 * CanonicalConverter — Marker für Konverter, die bereits fertige AVefi-Datensätze
 * liefern ({work, manifestations[], items[]}) statt des internen Zwischenformats.
 *
 * \worker\convert erkennt daran, dass es AvefiMapper::toAvefi überspringen und die
 * Datensätze direkt ablegen kann. Ein Zwischenformat, das der Profil-Konverter erst
 * aufbauen und der Mapper anschließend wieder auseinandernehmen müsste, würde nur
 * Genauigkeit kosten.
 */

interface CanonicalConverter {

	/** Ertrag je Datensatz: ["canonical"=>[...], "source"=>[...]] */

	/** Diagnose für den Prüfbericht, nach dem Durchlauf abrufbar. */
	public function report(): array;
}
